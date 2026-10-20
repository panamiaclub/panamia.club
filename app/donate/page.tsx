'use client';

import { useState, useRef } from 'react';
import { Medal, Trophy, Crown, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import PublicPageShell from '@/components/PublicPageShell';
import publicStyles from '@/components/PublicPageShell.module.css';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const preAmounts = [25, 40, 100, 250, 500, 1000, 2500];
const monthPreAmounts = [10, 15, 25];

interface TierBadgeProps {
  tier: number;
}

function TierBadge({ tier }: TierBadgeProps) {
  if (tier === 1) {
    return (
      <div className="bg-pana-blue inline-flex items-center gap-1 rounded-full px-3 py-1 font-semibold text-white">
        <Medal className="h-4 w-4" />
        <span>dePana</span>
      </div>
    );
  }
  if (tier === 2) {
    return (
      <div className="bg-pana-yellow inline-flex items-center gap-1 rounded-full px-3 py-1 font-semibold text-white">
        <Trophy className="h-4 w-4" />
        <span>Pana Confiado</span>
      </div>
    );
  }
  if (tier === 3) {
    return (
      <div className="bg-pana-pink inline-flex items-center gap-1 rounded-full px-3 py-1 font-semibold text-white">
        <Crown className="h-4 w-4" />
        <span>Pana Real</span>
      </div>
    );
  }
  return <span className="text-muted-foreground text-sm">None</span>;
}

export default function DonatePage() {
  const [email, setEmail] = useState('');
  const [amount, setAmount] = useState(0.0);
  const [comment, setComment] = useState('');
  const [dedicate, setDedicate] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const customAmountInputRef = useRef<HTMLInputElement>(null);

  let monthlyTier = 0;
  if (isRecurring && amount >= 25) {
    monthlyTier = 3;
  } else if (isRecurring && amount >= 15 && amount < 25) {
    monthlyTier = 2;
  } else if (isRecurring && amount >= 10 && amount < 15) {
    monthlyTier = 1;
  }

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Derived state - compute during render instead of using useEffect
  const _isOther =
    !preAmounts.includes(amount) && !monthPreAmounts.includes(amount);
  const allReqFields = validateEmail(email) && amount > 0;

  const focusCustomAmountInput = () => {
    if (customAmountInputRef.current) {
      customAmountInputRef.current.focus();
    }
    setAmount(0);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const response = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amount * 100,
        isRecurring,
        customerEmail: email,
        dedicate,
        comment,
        monthlyTier,
      }),
    });
    const { url } = await response.json();
    if (url) {
      // In Stripe.js v8+, redirect directly to the checkout URL
      window.location.href = url;
    } else {
      console.error('Checkout session URL not received');
    }
  };

  const benefits = [
    {
      feature:
        'Access to exclusive video + newsletter content (PanaVizión & LeoLero)',
      depana: true,
      confiado: true,
      real: true,
    },
    {
      feature: "Access to PanaPro features on Pana MIA's website",
      depana: true,
      confiado: true,
      real: true,
    },
    {
      feature: 'Discount on Pana MIA merch',
      depana: '10%',
      confiado: '10%',
      real: '10%',
    },
    {
      feature: 'Discount on Pana MIA and affiliated events',
      depana: '5%',
      confiado: '10%',
      real: '10%',
    },
    {
      feature:
        'Gente dePana Card (discounts/special access to local goods, services, events)',
      depana: false,
      confiado: true,
      real: true,
    },
    {
      feature: '1 free ticket a month to select Pana MIA and affiliated events',
      depana: false,
      confiado: false,
      real: true,
    },
    {
      feature: 'First to know about Pana MIA developments',
      depana: false,
      confiado: false,
      real: true,
    },
    {
      feature: 'Invited into our focus group pool to test new products',
      depana: false,
      confiado: false,
      real: true,
    },
  ];

  return (
    <PublicPageShell
      eyebrow="Support Pana MIA"
      title="MAKE A DONATION"
      intro="Your contribution helps Pana MIA build community technology, support local culture, and connect the people shaping South Florida."
    >
      <div className="mx-auto max-w-4xl">
        <Card className={publicStyles.panel}>
          <CardContent className="p-6 md:p-8">
            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Intro Section */}
              <div className="space-y-4">
                <h2 className="text-center text-2xl font-bold">
                  Support Our Club
                </h2>
                <div className="space-y-4 text-lg">
                  <p>
                    Pana MIA Club works hard towards our vision for a unified
                    local SoFlo community everyday. We know we can do it with
                    your help! You can support us by funding our mission with a
                    one-time donation or by joining our community of supporters
                    called Gente dePana! Our Gente dePana subscribers are the
                    foundation of Pana MIA's sustainability, monthly
                    contributions allow us to make bigger strides in our
                    projects to support the local community. In return, our
                    Gente are rewarded with so many benefits, discounts and
                    perks that give you special access to all things Pana!
                  </p>
                  <p className="font-bold">
                    If you're committed to supporting the local South Florida
                    community, become a Gente de Pana!
                  </p>
                </div>
              </div>

              {/* Mobile Tier Cards (visible on mobile) */}
              <div className="space-y-4 md:hidden">
                <Card className="bg-pana-blue text-white">
                  <CardContent className="p-6 text-center">
                    <Medal className="mx-auto mb-4 h-16 w-16" />
                    <h3 className="mb-4 text-xl font-bold">dePana</h3>
                    <ul className="space-y-2 text-left">
                      <li>
                        Access to exclusive video + newsletter content
                        (PanaVizión & LeoLero)
                      </li>
                      <li>Access to PanaPro features on Pana MIA's website</li>
                      <li>5% discount on Pana MIA and affiliated events</li>
                      <li>10% discount on Pana MIA merch</li>
                    </ul>
                  </CardContent>
                </Card>

                <Card className="bg-pana-yellow text-white">
                  <CardContent className="p-6 text-center">
                    <Trophy className="mx-auto mb-4 h-16 w-16" />
                    <h3 className="mb-4 text-xl font-bold">Pana Confiado</h3>
                    <ul className="space-y-2 text-left">
                      <li>
                        Access to exclusive video + newsletter content
                        (PanaVizión & LeoLero)
                      </li>
                      <li>Access to PanaPro features on Pana MIA's website</li>
                      <li>
                        Gente dePana Card (discounts/special access to local
                        goods, services, events)
                      </li>
                      <li>10% discount on Pana MIA and affiliated events</li>
                      <li>10% discount on Pana MIA merch</li>
                    </ul>
                  </CardContent>
                </Card>

                <Card className="bg-pana-pink text-white">
                  <CardContent className="p-6 text-center">
                    <Crown className="mx-auto mb-4 h-16 w-16" />
                    <h3 className="mb-4 text-xl font-bold">Pana Real</h3>
                    <ul className="space-y-2 text-left">
                      <li>
                        Access to exclusive video + newsletter content
                        (PanaVizión & LeoLero)
                      </li>
                      <li>Access to PanaPro features on Pana MIA's website</li>
                      <li>
                        Gente dePana Card (discounts/special access to local
                        goods, services, events)
                      </li>
                      <li>First to know about Pana MIA developments</li>
                      <li>
                        Invited into our Focus group pool to test new products
                      </li>
                      <li>
                        1 free ticket a month to select Pana MIA and affiliated
                        events
                      </li>
                      <li>10% discount on Pana MIA and affiliated events</li>
                      <li>10% discount on Pana MIA merch</li>
                    </ul>
                  </CardContent>
                </Card>
              </div>

              {/* Desktop Comparison Table (visible on desktop) */}
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-1/2"></TableHead>
                      <TableHead className="text-center">
                        <div className="flex flex-col items-center gap-2">
                          <Medal className="h-12 w-12" />
                          <span className="font-bold">dePana</span>
                        </div>
                      </TableHead>
                      <TableHead className="text-center">
                        <div className="flex flex-col items-center gap-2">
                          <Trophy className="h-12 w-12" />
                          <span className="font-bold">Pana Confiado</span>
                        </div>
                      </TableHead>
                      <TableHead className="text-center">
                        <div className="flex flex-col items-center gap-2">
                          <Crown className="h-12 w-12" />
                          <span className="font-bold">Pana Real</span>
                        </div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {benefits.map((benefit, index) => (
                      <TableRow key={index}>
                        <TableCell>{benefit.feature}</TableCell>
                        <TableCell className="text-center">
                          {typeof benefit.depana === 'boolean' ? (
                            benefit.depana ? (
                              <Check className="mx-auto h-5 w-5 text-green-600" />
                            ) : (
                              <X className="text-muted-foreground mx-auto h-5 w-5" />
                            )
                          ) : (
                            benefit.depana
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {typeof benefit.confiado === 'boolean' ? (
                            benefit.confiado ? (
                              <Check className="mx-auto h-5 w-5 text-green-600" />
                            ) : (
                              <X className="text-muted-foreground mx-auto h-5 w-5" />
                            )
                          ) : (
                            benefit.confiado
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {typeof benefit.real === 'boolean' ? (
                            benefit.real ? (
                              <Check className="mx-auto h-5 w-5 text-green-600" />
                            ) : (
                              <X className="text-muted-foreground mx-auto h-5 w-5" />
                            )
                          ) : (
                            benefit.real
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Donation Selection */}
              <div className="space-y-6">
                <div>
                  <h3 className="mb-2 text-center text-xl font-bold">
                    Select Your Donation
                  </h3>
                  <p className="text-muted-foreground text-center">
                    Select an option below or enter a custom donation amount
                  </p>
                </div>

                {/* Recurring Donation */}
                <div className="space-y-4">
                  <h4 className="font-bold">Recurring Donation</h4>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <Button
                      type="button"
                      variant={
                        monthlyTier === 1 && isRecurring ? 'default' : 'outline'
                      }
                      className="bg-pana-navy hover:bg-pana-navy/90 flex h-auto items-center justify-center gap-2 py-4 text-white"
                      onClick={() => {
                        setAmount(10);
                        setIsRecurring(true);
                      }}
                    >
                      <Medal className="h-5 w-5" />
                      <span>$10/month</span>
                    </Button>
                    <Button
                      type="button"
                      variant={
                        monthlyTier === 2 && isRecurring ? 'default' : 'outline'
                      }
                      className="bg-pana-navy hover:bg-pana-navy/90 flex h-auto items-center justify-center gap-2 py-4 text-white"
                      onClick={() => {
                        setAmount(15);
                        setIsRecurring(true);
                      }}
                    >
                      <Trophy className="h-5 w-5" />
                      <span>$15/month</span>
                    </Button>
                    <Button
                      type="button"
                      variant={
                        monthlyTier === 3 && isRecurring ? 'default' : 'outline'
                      }
                      className="bg-pana-navy hover:bg-pana-navy/90 flex h-auto items-center justify-center gap-2 py-4 text-white"
                      onClick={() => {
                        setAmount(25);
                        setIsRecurring(true);
                      }}
                    >
                      <Crown className="h-5 w-5" />
                      <span>$25/month</span>
                    </Button>
                  </div>
                </div>

                {/* One-Time Donation */}
                <div className="space-y-4">
                  <h4 className="font-bold">One-Time Donation</h4>
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    {preAmounts.map((presetAmount) => (
                      <Button
                        key={presetAmount}
                        type="button"
                        variant={
                          amount === presetAmount && !isRecurring
                            ? 'default'
                            : 'outline'
                        }
                        className="bg-pana-navy hover:bg-pana-navy/90 h-auto py-4 text-white"
                        onClick={() => {
                          setAmount(presetAmount);
                          setIsRecurring(false);
                        }}
                      >
                        ${presetAmount}
                      </Button>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      className="h-auto py-4"
                      onClick={() => {
                        focusCustomAmountInput();
                        setIsRecurring(false);
                      }}
                    >
                      Custom
                    </Button>
                  </div>
                </div>
              </div>

              {/* Form Fields */}
              <div className="space-y-6 border-t pt-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount:</Label>
                    <Input
                      id="amount"
                      ref={customAmountInputRef}
                      type="number"
                      step={0.01}
                      placeholder="Custom Amount"
                      value={amount !== 0 ? amount : ''}
                      onChange={(e) => setAmount(Number(e.target.value))}
                    />
                  </div>
                  <div className="flex items-center space-x-2 pt-8">
                    <Checkbox
                      id="recurring"
                      checked={isRecurring}
                      onCheckedChange={(checked) =>
                        setIsRecurring(checked as boolean)
                      }
                    />
                    <Label htmlFor="recurring">Recurring</Label>
                  </div>
                  <div className="space-y-2">
                    <Label>Subscription</Label>
                    <div className="pt-2">
                      <TierBadge tier={monthlyTier} />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email: *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dedicate">Dedicate Donation To:</Label>
                  <Select
                    value={dedicate}
                    onValueChange={(value) => setDedicate(value)}
                  >
                    <SelectTrigger id="dedicate">
                      <SelectValue placeholder="- No Dedication -" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">- No Dedication -</SelectItem>
                      <SelectItem value="Directory">Directory</SelectItem>
                      <SelectItem value="Other">
                        Other (please describe)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="comment">Comments:</Label>
                  <Textarea
                    id="comment"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Any comment?"
                    rows={3}
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="anonymous"
                    checked={isAnonymous}
                    onCheckedChange={(checked) =>
                      setIsAnonymous(checked as boolean)
                    }
                  />
                  <Label htmlFor="anonymous">Donate Anonymously</Label>
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex justify-center pt-6">
                <Button
                  type="submit"
                  size="lg"
                  className="bg-pana-navy hover:bg-pana-navy/90 px-12"
                  disabled={!allReqFields}
                >
                  Make My Donation
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </PublicPageShell>
  );
}
